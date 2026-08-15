type Props = {
  step: number;
  total?: number;
};

export function StepProgress({ step, total = 2 }: Props) {
  return (
    <div className="progress">
      <div className="progress-track">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={index < step ? 'progress-seg on' : 'progress-seg'}
          />
        ))}
      </div>
      <span className="progress-label">
        {step} / {total}
      </span>
    </div>
  );
}
