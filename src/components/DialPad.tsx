import { Button } from "@/components/ui/button";

const DIAL_PAD = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

interface DialPadProps {
  onDigit: (digit: string) => void;
  disabled?: boolean;
}

export default function DialPad({ onDigit, disabled }: DialPadProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {DIAL_PAD.flat().map((digit) => (
        <Button
          key={digit}
          variant="outline"
          className="h-10 text-base font-medium"
          onClick={() => onDigit(digit)}
          disabled={disabled}
        >
          {digit}
        </Button>
      ))}
    </div>
  );
}
