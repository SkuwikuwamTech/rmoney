import React, { useState } from 'react';
import { Calculator as CalcIcon, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';

export const SidebarCalculator: React.FC = () => {
  const [display, setDisplay] = useState<string>('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState<boolean>(false);
  const [lastAnswer, setLastAnswer] = useState<number>(0);
  const [memory, setMemory] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Helper to format display number nicely
  const formatDisplay = (val: string) => {
    if (val === 'Error' || val === 'NaN') return 'Error';
    return val;
  };

  const handleDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      if (display === '0') {
        setDisplay(digit);
      } else if (display.length < 14) {
        setDisplay(display + digit);
      }
    }
  };

  const handleDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleAllClear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperation(null);
    setWaitingForOperand(false);
  };

  const handleBackspace = () => {
    if (waitingForOperand) return;
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const handleToggleSign = () => {
    const num = parseFloat(display);
    if (isNaN(num)) return;
    setDisplay(String(-num));
  };

  const handleExp = () => {
    if (!display.includes('e') && !display.includes('E') && display !== 'Error') {
      setDisplay(display + 'e');
    }
  };

  const handleRound = () => {
    const num = parseFloat(display);
    if (isNaN(num)) return;
    if (num === 0) {
      // Random number between 0 and 1
      setDisplay(String(Math.random().toFixed(4)));
    } else {
      // If already has decimals, round to 2 decimals or integer
      const rounded = Math.round(num * 100) / 100;
      setDisplay(String(rounded));
    }
  };

  const executeOperation = (prev: number, current: number, op: string): number => {
    switch (op) {
      case '+':
        return prev + current;
      case '-':
        return prev - current;
      case '×':
      case '*':
        return prev * current;
      case '÷':
      case '/':
        return current === 0 ? NaN : prev / current;
      default:
        return current;
    }
  };

  const handleOperator = (nextOp: string) => {
    const inputValue = parseFloat(display);

    if (isNaN(inputValue)) {
      handleAllClear();
      return;
    }

    if (prevValue === null) {
      setPrevValue(inputValue);
    } else if (operation && !waitingForOperand) {
      const result = executeOperation(prevValue, inputValue, operation);
      if (isNaN(result) || !isFinite(result)) {
        setDisplay('Error');
        setPrevValue(null);
        setOperation(null);
        setWaitingForOperand(true);
        return;
      }
      setPrevValue(result);
      setDisplay(String(parseFloat(result.toFixed(8))));
    }

    setWaitingForOperand(true);
    setOperation(nextOp);
  };

  const handleEquals = () => {
    const inputValue = parseFloat(display);

    if (prevValue === null || !operation) return;

    const result = executeOperation(prevValue, inputValue, operation);

    if (isNaN(result) || !isFinite(result)) {
      setDisplay('Error');
    } else {
      const formatted = parseFloat(result.toFixed(8));
      setDisplay(String(formatted));
      setLastAnswer(formatted);
    }

    setPrevValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  };

  // Memory functions
  const handleMemoryAdd = () => {
    const val = parseFloat(display);
    if (!isNaN(val)) {
      setMemory((prev) => prev + val);
      setWaitingForOperand(true);
    }
  };

  const handleMemorySubtract = () => {
    const val = parseFloat(display);
    if (!isNaN(val)) {
      setMemory((prev) => prev - val);
      setWaitingForOperand(true);
    }
  };

  const handleMemoryRecall = () => {
    setDisplay(String(memory));
    setWaitingForOperand(false);
  };

  const handleAns = () => {
    setDisplay(String(lastAnswer));
    setWaitingForOperand(false);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(display);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-3 my-2 bg-slate-950/80 rounded-xl border border-slate-800 shadow-lg overflow-hidden select-none">
      {/* Header bar / Collapsible toggle */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 text-slate-300 hover:text-white cursor-pointer transition-colors text-xs font-semibold border-b border-slate-800/80"
        title={isCollapsed ? 'Expand Calculator' : 'Collapse Calculator'}
      >
        <div className="flex items-center gap-1.5">
          <CalcIcon size={13} className="text-blue-400" />
          <span className="tracking-wide text-[11px] font-bold text-slate-300">Calculator</span>
          {memory !== 0 && (
            <span className="px-1 py-0.2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[9px] font-mono">
              M
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Copy current value"
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </button>
          {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-2 space-y-1.5">
          {/* LCD Display */}
          <div
            onClick={handleCopy}
            className="relative px-2.5 py-1.5 bg-[#255f8e] text-white rounded-md border border-[#1e4e75] shadow-inner cursor-pointer hover:brightness-105 transition-all text-right group"
            title="Click to copy value"
          >
            {/* Small calculation history indicator */}
            <div className="text-[9px] font-mono text-blue-200/80 h-3 leading-3 truncate overflow-hidden">
              {prevValue !== null && operation ? `${prevValue} ${operation}` : memory !== 0 ? `M = ${memory}` : ''}
            </div>

            {/* Main number display */}
            <div className="text-lg font-bold font-mono tracking-tight leading-none truncate">
              {formatDisplay(display)}
            </div>

            {copied && (
              <span className="absolute left-2 bottom-1.5 text-[9px] font-sans font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded shadow-sm">
                Copied
              </span>
            )}
          </div>

          {/* 5x5 Keypad matching the user's mockup */}
          <div className="grid grid-cols-5 gap-1 text-xs font-bold">
            {/* Row 1: 7, 8, 9, +, Back */}
            <button
              type="button"
              onClick={() => handleDigit('7')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              7
            </button>
            <button
              type="button"
              onClick={() => handleDigit('8')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => handleDigit('9')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              9
            </button>
            <button
              type="button"
              onClick={() => handleOperator('+')}
              className="py-1.5 rounded bg-sky-200 hover:bg-sky-100 text-sky-950 border border-sky-300/80 active:scale-95 transition-all"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-1.5 rounded bg-slate-200 hover:bg-slate-100 text-slate-800 border border-slate-300 text-[10px] active:scale-95 transition-all"
              title="Backspace"
            >
              Back
            </button>

            {/* Row 2: 4, 5, 6, -, Ans */}
            <button
              type="button"
              onClick={() => handleDigit('4')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              4
            </button>
            <button
              type="button"
              onClick={() => handleDigit('5')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => handleDigit('6')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => handleOperator('-')}
              className="py-1.5 rounded bg-sky-200 hover:bg-sky-100 text-sky-950 border border-sky-300/80 active:scale-95 transition-all"
            >
              −
            </button>
            <button
              type="button"
              onClick={handleAns}
              className="py-1.5 rounded bg-slate-200 hover:bg-slate-100 text-slate-800 border border-slate-300 text-[10px] active:scale-95 transition-all"
              title="Last Answer"
            >
              Ans
            </button>

            {/* Row 3: 1, 2, 3, ×, M+ */}
            <button
              type="button"
              onClick={() => handleDigit('1')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => handleDigit('2')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handleDigit('3')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => handleOperator('×')}
              className="py-1.5 rounded bg-sky-200 hover:bg-sky-100 text-sky-950 border border-sky-300/80 active:scale-95 transition-all"
            >
              ×
            </button>
            <button
              type="button"
              onClick={handleMemoryAdd}
              className="py-1.5 rounded bg-slate-200 hover:bg-slate-100 text-slate-800 border border-slate-300 text-[10px] active:scale-95 transition-all"
              title="Memory Add"
            >
              M+
            </button>

            {/* Row 4: 0, ., EXP, ÷, M- */}
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDecimal}
              className="py-1.5 rounded bg-slate-300 hover:bg-white text-slate-900 border border-slate-400/60 active:scale-95 transition-all"
            >
              .
            </button>
            <button
              type="button"
              onClick={handleExp}
              className="py-1.5 rounded bg-slate-200 hover:bg-slate-100 text-slate-800 border border-slate-300 text-[9px] active:scale-95 transition-all font-mono"
              title="Scientific Exponent (e)"
            >
              EXP
            </button>
            <button
              type="button"
              onClick={() => handleOperator('÷')}
              className="py-1.5 rounded bg-sky-200 hover:bg-sky-100 text-sky-950 border border-sky-300/80 active:scale-95 transition-all"
            >
              ÷
            </button>
            <button
              type="button"
              onClick={handleMemorySubtract}
              className="py-1.5 rounded bg-slate-200 hover:bg-slate-100 text-slate-800 border border-slate-300 text-[10px] active:scale-95 transition-all"
              title="Memory Subtract"
            >
              M−
            </button>

            {/* Row 5: ±, RND, AC, =, MR */}
            <button
              type="button"
              onClick={handleToggleSign}
              className="py-1.5 rounded bg-slate-200 hover:bg-slate-100 text-slate-800 border border-slate-300 active:scale-95 transition-all"
              title="Negate Sign"
            >
              ±
            </button>
            <button
              type="button"
              onClick={handleRound}
              className="py-1.5 rounded bg-slate-200 hover:bg-slate-100 text-slate-800 border border-slate-300 text-[9px] active:scale-95 transition-all"
              title="Round to 2 decimals / Random"
            >
              RND
            </button>
            <button
              type="button"
              onClick={handleAllClear}
              className="py-1.5 rounded bg-blue-300 hover:bg-blue-200 text-blue-950 border border-blue-400/80 active:scale-95 transition-all"
              title="All Clear"
            >
              AC
            </button>
            <button
              type="button"
              onClick={handleEquals}
              className="py-1.5 rounded bg-blue-500 hover:bg-blue-400 text-white border border-blue-600 active:scale-95 transition-all shadow-2xs font-extrabold"
              title="Calculate"
            >
              =
            </button>
            <button
              type="button"
              onClick={handleMemoryRecall}
              className="py-1.5 rounded bg-slate-200 hover:bg-slate-100 text-slate-800 border border-slate-300 text-[10px] active:scale-95 transition-all"
              title="Memory Recall"
            >
              MR
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
