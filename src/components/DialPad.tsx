import { Button } from "@/components/ui/button";

const DIAL_PAD: { digit: string; letters: string }[][] = [
  [
    { digit: "1", letters: "" },
    { digit: "2", letters: "ABC" },
    { digit: "3", letters: "DEF" },
  ],
  [
    { digit: "4", letters: "GHI" },
    { digit: "5", letters: "JKL" },
    { digit: "6", letters: "MNO" },
  ],
  [
    { digit: "7", letters: "PQRS" },
    { digit: "8", letters: "TUV" },
    { digit: "9", letters: "WXYZ" },
  ],
  [
    { digit: "*", letters: "" },
    { digit: "0", letters: "+" },
    { digit: "#", letters: "" },
  ],
];

interface DialPadProps {
  onDigit: (digit: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function DialPad({ onDigit, disabled, compact }: DialPadProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {DIAL_PAD.flat().map(({ digit, letters }) => (
        <Button
          key={digit}
          variant="ghost"
          className={`${compact ? "h-11" : "h-14"} flex flex-col items-center justify-center gap-0 rounded-lg hover:bg-muted/80 transition-colors`}
          onClick={() => onDigit(digit)}
          disabled={disabled}
        >
          <span className={`${compact ? "text-lg" : "text-xl"} font-semibold leading-none text-foreground`}>
            {digit}
          </span>
          {letters && (
            <span className="text-[9px] font-medium tracking-[0.15em] text-muted-foreground leading-none mt-0.5">
              {letters}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}
