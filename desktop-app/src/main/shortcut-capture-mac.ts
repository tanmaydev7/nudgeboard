import { spawn, type ChildProcess } from 'child_process';

export type CapturedChord = {
  keys: string[];
  done: boolean;
};

const RUBY_CAPTURE = `
require "fiddle"
require "fiddle/import"
require "fiddle/closure"
require "json"

$stdout.sync = true

module CG
  extend Fiddle::Importer
  dlload "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"
  extern "void* CGEventTapCreate(unsigned int, unsigned int, unsigned int, unsigned long long, void*, void*)"
  extern "void CGEventTapEnable(void*, unsigned char)"
  extern "long long CGEventGetIntegerValueField(void*, unsigned int)"
  extern "unsigned long long CGEventGetFlags(void*)"
end
module CF
  extend Fiddle::Importer
  dlload "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
  extern "void* CFMachPortCreateRunLoopSource(void*, void*, long)"
  extern "void* CFRunLoopGetCurrent()"
  extern "void CFRunLoopAddSource(void*, void*, void*)"
  extern "void CFRunLoopRun()"
end

KEYS = {
  0=>"A",1=>"S",2=>"D",3=>"F",4=>"H",5=>"G",6=>"Z",7=>"X",8=>"C",9=>"V",
  11=>"B",12=>"Q",13=>"W",14=>"E",15=>"R",16=>"Y",17=>"T",
  18=>"1",19=>"2",20=>"3",21=>"4",22=>"6",23=>"5",25=>"9",26=>"7",28=>"8",29=>"0",
  31=>"O",32=>"U",34=>"I",35=>"P",36=>"Enter",37=>"L",38=>"J",40=>"K",
  45=>"N",46=>"M",48=>"Tab",49=>"Space",51=>"Backspace",53=>"Esc",
  96=>"F5",97=>"F6",98=>"F7",99=>"F3",100=>"F8",101=>"F9",103=>"F11",
  109=>"F10",111=>"F12",115=>"Home",116=>"PageUp",118=>"F4",119=>"End",
  120=>"F2",121=>"PageDown",122=>"F1",123=>"Left",124=>"Right",125=>"Down",126=>"Up"
}
MOD_CODES = {59=>1,62=>1,56=>1,60=>1,58=>1,61=>1,55=>1,54=>1}
FLAG_CTRL = 0x40000
FLAG_SHIFT = 0x20000
FLAG_OPT = 0x80000
FLAG_CMD = 0x100000

def mods_from(flags)
  out = []
  out << "Ctrl" if flags & FLAG_CTRL != 0
  out << "Shift" if flags & FLAG_SHIFT != 0
  out << "Option" if flags & FLAG_OPT != 0
  out << "Cmd" if flags & FLAG_CMD != 0
  out
end

$cb = Fiddle::Closure::BlockCaller.new(
  Fiddle::TYPE_VOIDP,
  [Fiddle::TYPE_VOIDP, Fiddle::TYPE_INT, Fiddle::TYPE_VOIDP, Fiddle::TYPE_VOIDP]
) do |proxy, type, event, refcon|
  begin
    if type == 12
      flags = CG.CGEventGetFlags(event)
      puts({ keys: mods_from(flags), done: false }.to_json)
      event
    elsif type == 10
      repeat = CG.CGEventGetIntegerValueField(event, 8)
      code = CG.CGEventGetIntegerValueField(event, 9)
      if repeat != 0 || MOD_CODES[code]
        event
      else
        flags = CG.CGEventGetFlags(event)
        name = KEYS[code] || "Key#{code}"
        puts({ keys: mods_from(flags) + [name], done: true }.to_json)
        Fiddle::Pointer.new(0)
      end
    else
      event
    end
  rescue
    event
  end
end

mask = (1 << 10) | (1 << 12)
tap = CG.CGEventTapCreate(0, 0, 0, mask, $cb, nil)
tap = CG.CGEventTapCreate(1, 0, 0, mask, $cb, nil) if tap.null?
if tap.null?
  puts({ error: "no_tap" }.to_json)
  exit 1
end
cf = Fiddle.dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
mode = Fiddle::Pointer.new(cf["kCFRunLoopCommonModes"]).ptr
src = CF.CFMachPortCreateRunLoopSource(nil, tap, 0)
CF.CFRunLoopAddSource(CF.CFRunLoopGetCurrent(), src, mode)
CG.CGEventTapEnable(tap, 1)
puts({ ok: true }.to_json)
CF.CFRunLoopRun()
`;

let child: ChildProcess | null = null;

const killChild = (): void => {
  if (!child) {
    return;
  }
  child.kill('SIGTERM');
  child = null;
};

export const stopMacShortcutCapture = (): void => {
  killChild();
};

export const startMacShortcutCapture = (
  onChord: (chord: CapturedChord) => void,
): Promise<boolean> => {
  stopMacShortcutCapture();
  if (process.platform !== 'darwin') {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(ok);
    };

    const proc = spawn('/usr/bin/ruby', ['-e', RUBY_CAPTURE], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    child = proc;
    let buf = '';

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
        if (!line) {
          continue;
        }
        try {
          const msg = JSON.parse(line) as {
            ok?: boolean;
            error?: string;
            keys?: string[];
            done?: boolean;
          };
          if (msg.error) {
            finish(false);
            return;
          }
          if (msg.ok) {
            finish(true);
            return;
          }
          if (Array.isArray(msg.keys)) {
            onChord({ keys: msg.keys, done: msg.done === true });
          }
        } catch {
          // ignore partial JSON
        }
      }
    });

    proc.on('exit', () => {
      if (child === proc) {
        child = null;
      }
      finish(false);
    });

    setTimeout(() => finish(false), 2500);
  });
};
