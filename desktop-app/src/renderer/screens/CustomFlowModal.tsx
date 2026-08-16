import { useEffect, useState } from 'react';
import {
  LuFolderOpen,
  LuCircleDot,
  LuArrowUp,
  LuArrowDown,
  LuX,
  LuPlus,
  LuKeyboard,
  LuClock,
} from 'react-icons/lu';
import {
  CUSTOM_ICON_PRESETS,
  type CustomFlow,
  type FlowStep,
} from '../../shared/ipc-types';

type Props = {
  isOpen: boolean;
  initialFlow?: CustomFlow | null;
  presetIcons: Record<string, string>;
  onSave: (flow: CustomFlow) => void;
  onClose: () => void;
};

export function CustomFlowModal({
  isOpen,
  initialFlow,
  presetIcons,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState('');
  const [iconPreset, setIconPreset] = useState('terminal');
  const [iconPath, setIconPath] = useState('');
  const [iconDataUrl, setIconDataUrl] = useState('');
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialFlow) {
        setName(initialFlow.name);
        setIconPreset(initialFlow.iconPreset ?? 'terminal');
        setIconPath(initialFlow.iconPath ?? '');
        setIconDataUrl(initialFlow.iconDataUrl ?? '');
        setSteps(
          initialFlow.steps.length > 0
            ? JSON.parse(JSON.stringify(initialFlow.steps))
            : [{ type: 'launch', path: '', args: '' }],
        );
      } else {
        setName('');
        setIconPreset('terminal');
        setIconPath('');
        setIconDataUrl('');
        setSteps([{ type: 'launch', path: '', args: '' }]);
      }
      setRecordingIndex(null);
      setError(null);
    }
  }, [isOpen, initialFlow]);

  // Keyboard shortcut listener for recording
  useEffect(() => {
    if (recordingIndex === null) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const modifiers: string[] = [];
      if (e.ctrlKey) modifiers.push('Ctrl');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.altKey) modifiers.push('Alt');
      if (e.metaKey) modifiers.push('Win');

      const rawKey = e.key;
      const isOnlyModifier = ['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(
        rawKey,
      );

      if (isOnlyModifier) {
        // Just modifiers pressed so far
        updateStep(recordingIndex, {
          type: 'shortcut',
          keys: modifiers,
          rawKey,
        });
        return;
      }

      let mainKey = rawKey;
      if (rawKey === ' ') mainKey = 'Space';
      else if (rawKey === 'Escape') mainKey = 'Esc';
      else if (rawKey === 'Delete') mainKey = 'Del';
      else if (rawKey.startsWith('Arrow')) mainKey = rawKey.replace('Arrow', '');
      else if (mainKey.length === 1) mainKey = mainKey.toUpperCase();

      const combo = [...modifiers, mainKey];
      updateStep(recordingIndex, {
        type: 'shortcut',
        keys: combo,
        rawKey,
      });
      setRecordingIndex(null);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [recordingIndex]);

  if (!isOpen) {
    return null;
  }

  const updateStep = (index: number, updated: FlowStep) => {
    setSteps((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) {
      return;
    }
    setSteps((prev) => prev.filter((_, i) => i !== index));
    if (recordingIndex === index) {
      setRecordingIndex(null);
    }
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= steps.length) {
      return;
    }
    setSteps((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const addStep = (type: FlowStep['type']) => {
    if (type === 'launch') {
      setSteps((prev) => [...prev, { type: 'launch', path: '', args: '' }]);
    } else if (type === 'shortcut') {
      setSteps((prev) => [...prev, { type: 'shortcut', keys: ['Ctrl', 'C'] }]);
    } else if (type === 'delay') {
      setSteps((prev) => [...prev, { type: 'delay', ms: 500 }]);
    }
  };

  const browseFileForStep = async (index: number) => {
    const res = await window.api.browseFile('executable');
    if (res) {
      updateStep(index, {
        type: 'launch',
        path: res.path,
        args: (steps[index] as { args?: string }).args ?? '',
      });
      if (!name) {
        setName(res.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const browseCustomIcon = async () => {
    const res = await window.api.browseFile('image');
    if (res) {
      setIconPath(res.path);
      setIconDataUrl(res.iconDataUrl ?? '');
      setIconPreset('');
    }
  };

  const bakeIconToPng = async (src?: string): Promise<string | undefined> => {
    if (!src) {
      return undefined;
    }
    if (src.startsWith('data:image/png')) {
      return src;
    }
    try {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx || image.naturalWidth === 0) {
        return undefined;
      }
      ctx.drawImage(image, 0, 0, 128, 128);
      return canvas.toDataURL('image/png');
    } catch {
      return undefined;
    }
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please provide a name for this custom action.');
      return;
    }

    if (steps.length === 0) {
      setError('Please add at least one step to the flow.');
      return;
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.type === 'launch' && !s.path.trim()) {
        setError(`Step ${i + 1}: Please specify a file path, program, or URL.`);
        return;
      }
      if (s.type === 'shortcut' && (!s.keys || s.keys.length === 0)) {
        setError(`Step ${i + 1}: Please record a keyboard shortcut.`);
        return;
      }
    }

    const activeSrc =
      iconDataUrl ||
      (iconPreset
        ? presetIcons[iconPreset] ?? presetIcons[`preset:${iconPreset}`]
        : undefined);

    void (async () => {
      const baked = await bakeIconToPng(activeSrc);
      const flow: CustomFlow = {
        id:
          initialFlow?.id ??
          `flow_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: trimmedName,
        iconPreset: iconPreset || undefined,
        iconPath: iconPath || undefined,
        iconDataUrl: baked || iconDataUrl || undefined,
        steps,
      };
      onSave(flow);
      onClose();
    })();
  };

  const activeIconSrc =
    iconDataUrl ||
    (iconPreset ? presetIcons[iconPreset] ?? presetIcons[`preset:${iconPreset}`] : undefined);

  return (
    <div className="modal-backdrop custom-flow-backdrop">
      <div className="modal custom-flow-modal" role="dialog" aria-modal="true">
        <div className="flow-modal-header">
          <div>
            <h2>{initialFlow ? 'Edit Custom Flow' : 'Create Custom Flow'}</h2>
            <p>
              Chain multiple actions together: launch apps, open files or
              terminals, and trigger recorded keyboard shortcuts.
            </p>
          </div>
          <button
            type="button"
            className="icon-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {error ? <div className="flow-error-banner">{error}</div> : null}

        <div className="flow-modal-body">
          {/* Section 1: Name and Icon */}
          <div className="flow-section">
            <label className="flow-label">
              <span>Action Name</span>
              <input
                type="text"
                className="flow-input text-input"
                placeholder="e.g. Open Dev Stack, Gaming Mode, Quick Note"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                maxLength={40}
              />
            </label>

            <div className="flow-icon-picker">
              <span className="flow-label-text">Tile Icon</span>
              <div className="flow-icon-row">
                <div className="flow-icon-preview">
                  {activeIconSrc ? (
                    <img
                      src={activeIconSrc}
                      alt="Selected Icon"
                      className="preview-img"
                    />
                  ) : (
                    <span className="preview-fallback">
                      {name ? [...name][0] : '>_'}
                    </span>
                  )}
                </div>

                <div className="flow-icon-controls">
                  <div className="flow-icon-presets">
                    {CUSTOM_ICON_PRESETS.map((p) => {
                      const src =
                        presetIcons[p.id] ?? presetIcons[`preset:${p.id}`];
                      const isSelected = iconPreset === p.id && !iconDataUrl;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`preset-icon-btn${isSelected ? ' selected' : ''}`}
                          title={p.name}
                          onClick={() => {
                            setIconPreset(p.id);
                            setIconDataUrl('');
                            setIconPath('');
                          }}
                        >
                          {src ? (
                            <img src={src} alt={p.name} />
                          ) : (
                            <span>{p.glyph}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="btn-browse-icon"
                    onClick={browseCustomIcon}
                  >
                    <LuFolderOpen size={14} /> Browse Image File…
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Steps Pipeline */}
          <div className="flow-section">
            <div className="flow-section-head">
              <span className="flow-label-text">Flow Steps (Executed in order)</span>
              <span className="flow-step-count">{steps.length} step(s)</span>
            </div>

            <div className="flow-steps-list">
              {steps.map((step, index) => (
                <div key={index} className="flow-step-card">
                  <div className="step-card-header">
                    <span className="step-badge">Step {index + 1}</span>

                    <div className="step-type-toggles">
                      <button
                        type="button"
                        className={`type-toggle-btn${step.type === 'launch' ? ' active' : ''}`}
                        onClick={() =>
                          updateStep(index, {
                            type: 'launch',
                            path: '',
                            args: '',
                          })
                        }
                      >
                        <LuFolderOpen size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                        Open Program / File
                      </button>
                      <button
                        type="button"
                        className={`type-toggle-btn${step.type === 'shortcut' ? ' active' : ''}`}
                        onClick={() =>
                          updateStep(index, {
                            type: 'shortcut',
                            keys: ['Ctrl', 'Shift', 'Esc'],
                          })
                        }
                      >
                        <LuKeyboard size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                        Run Shortcut
                      </button>
                      <button
                        type="button"
                        className={`type-toggle-btn${step.type === 'delay' ? ' active' : ''}`}
                        onClick={() =>
                          updateStep(index, { type: 'delay', ms: 500 })
                        }
                      >
                        <LuClock size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                        Wait Delay
                      </button>
                    </div>

                    <div className="step-reorder">
                      {index > 0 ? (
                        <button
                          type="button"
                          className="step-btn-mini"
                          onClick={() => moveStep(index, 'up')}
                          title="Move step up"
                        >
                          <LuArrowUp size={12} />
                        </button>
                      ) : null}
                      {index < steps.length - 1 ? (
                        <button
                          type="button"
                          className="step-btn-mini"
                          onClick={() => moveStep(index, 'down')}
                          title="Move step down"
                        >
                          <LuArrowDown size={12} />
                        </button>
                      ) : null}
                      {steps.length > 1 ? (
                        <button
                          type="button"
                          className="step-btn-mini delete"
                          onClick={() => removeStep(index)}
                          title="Remove step"
                        >
                          <LuX size={12} />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Step Body by Type */}
                  <div className="step-card-body">
                    {step.type === 'launch' ? (
                      <div className="step-launch-config">
                        <div className="path-input-row">
                          <input
                            type="text"
                            className="flow-input path-input"
                            placeholder="File / Executable / Terminal path or URL…"
                            value={step.path}
                            onChange={(e) =>
                              updateStep(index, {
                                ...step,
                                path: e.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            className="btn-browse-file"
                            onClick={() => browseFileForStep(index)}
                          >
                            <LuFolderOpen size={13} /> Browse…
                          </button>
                        </div>

                        <div className="args-input-row">
                          <input
                            type="text"
                            className="flow-input args-input"
                            placeholder="Optional arguments (e.g. --incognito, file.txt)…"
                            value={step.args ?? ''}
                            onChange={(e) =>
                              updateStep(index, {
                                ...step,
                                args: e.target.value,
                              })
                            }
                          />
                        </div>

                        <div className="quick-presets-row">
                          <span className="preset-label">Quick Pick:</span>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, {
                                ...step,
                                path: 'powershell.exe',
                              })
                            }
                          >
                            PowerShell
                          </button>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, { ...step, path: 'wt.exe' })
                            }
                          >
                            Windows Terminal
                          </button>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, { ...step, path: 'cmd.exe' })
                            }
                          >
                            Command Prompt
                          </button>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, {
                                ...step,
                                path: 'explorer.exe',
                              })
                            }
                          >
                            File Explorer
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {step.type === 'shortcut' ? (
                      <div className="step-shortcut-config">
                        <div className="shortcut-recorder-row">
                          <div
                            className={`shortcut-keys-display${recordingIndex === index ? ' recording' : ''}`}
                          >
                            {recordingIndex === index ? (
                              <div className="recording-prompt">
                                <span className="rec-dot" />
                                <em>Recording… Press keys on your keyboard</em>
                              </div>
                            ) : step.keys && step.keys.length > 0 ? (
                              <div className="key-badges">
                                {step.keys.map((k, kIdx) => (
                                  <span key={kIdx} className="key-badge">
                                    {k}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="no-keys">No keys recorded</span>
                            )}
                          </div>

                          <button
                            type="button"
                            className={`btn-record${recordingIndex === index ? ' is-recording' : ''}`}
                            onClick={() =>
                              setRecordingIndex(
                                recordingIndex === index ? null : index,
                              )
                            }
                          >
                            {recordingIndex === index ? (
                              'Done'
                            ) : (
                              <>
                                <LuCircleDot size={13} color="#f87171" /> Record Keys
                              </>
                            )}
                          </button>
                        </div>

                        <div className="quick-presets-row">
                          <span className="preset-label">Presets:</span>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, {
                                ...step,
                                keys: ['Ctrl', 'C'],
                              })
                            }
                          >
                            Ctrl + C
                          </button>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, {
                                ...step,
                                keys: ['Ctrl', 'V'],
                              })
                            }
                          >
                            Ctrl + V
                          </button>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, {
                                ...step,
                                keys: ['Ctrl', 'Shift', 'Esc'],
                              })
                            }
                          >
                            Task Manager
                          </button>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, {
                                ...step,
                                keys: ['Win', 'D'],
                              })
                            }
                          >
                            Show Desktop (Win+D)
                          </button>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, {
                                ...step,
                                keys: ['Alt', 'Tab'],
                              })
                            }
                          >
                            Alt + Tab
                          </button>
                          <button
                            type="button"
                            className="chip-preset"
                            onClick={() =>
                              updateStep(index, { ...step, keys: ['F5'] })
                            }
                          >
                            F5 (Refresh)
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {step.type === 'delay' ? (
                      <div className="step-delay-config">
                        <div className="delay-input-row">
                          <label className="delay-label">
                            <span>Wait duration (milliseconds):</span>
                            <input
                              type="number"
                              min={50}
                              max={10000}
                              step={50}
                              className="flow-input delay-input"
                              value={step.ms}
                              onChange={(e) =>
                                updateStep(index, {
                                  type: 'delay',
                                  ms: Number(e.target.value) || 500,
                                })
                              }
                            />
                            <span className="delay-sec">
                              ({(step.ms / 1000).toFixed(1)}s)
                            </span>
                          </label>
                        </div>
                        <div className="quick-presets-row">
                          <span className="preset-label">Quick:</span>
                          {[250, 500, 1000, 2000].map((ms) => (
                            <button
                              key={ms}
                              type="button"
                              className={`chip-preset${step.ms === ms ? ' active' : ''}`}
                              onClick={() => updateStep(index, { type: 'delay', ms })}
                            >
                              {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="flow-add-step-toolbar">
              <button
                type="button"
                className="btn-add-step"
                onClick={() => addStep('launch')}
              >
                <LuPlus size={12} style={{ marginRight: 3, verticalAlign: -1 }} /> Open File / Program
              </button>
              <button
                type="button"
                className="btn-add-step"
                onClick={() => addStep('shortcut')}
              >
                <LuPlus size={12} style={{ marginRight: 3, verticalAlign: -1 }} /> Run Shortcut
              </button>
              <button
                type="button"
                className="btn-add-step"
                onClick={() => addStep('delay')}
              >
                <LuPlus size={12} style={{ marginRight: 3, verticalAlign: -1 }} /> Wait Delay
              </button>
            </div>
          </div>
        </div>

        <div className="flow-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            Save Custom Action
          </button>
        </div>
      </div>
    </div>
  );
}
