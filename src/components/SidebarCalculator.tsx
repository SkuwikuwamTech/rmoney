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
        <div className="p-2 space-y-2">
          {/* LCD Display */}
          <div
            onClick={handleCopy}
            className="relative px-3 py-2 bg-[#0d233a] text-white rounded-lg border-2 border-[#1e4976] shadow-inner cursor-pointer hover:brightness-110 transition-all text-right group"
            title="Click to copy value"
          >
            {/* Calculation history indicator */}
            <div className="text-xs font-mono text-sky-300 font-semibold h-4 leading-4 truncate overflow-hidden">
              {prevValue !== null && operation ? `${prevValue} ${operation}` : memory !== 0 ? `M = ${memory}` : ''}
            </div>

            {/* Main number display */}
            <div className="text-2xl font-black font-mono tracking-wide leading-tight truncate text-white drop-shadow-xs">
              {formatDisplay(display)}
            </div>

            {copied && (
              <span className="absolute left-2.5 bottom-2 text-[10px] font-sans font-bold bg-emerald-500 text-white px-2 py-0.5 rounded shadow">
                Copied
              </span>
            )}
          </div>

          {/* 5x5 Keypad matching the user's mockup with large, high-contrast, easily readable numbers */}
          <div className="grid grid-cols-5 gap-1.5 text-xs font-bold">
            {/* Row 1: 7, 8, 9, +, Back */}
            <button
              type="button"
              onClick={() => handleDigit('7')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              7
            </button>
            <button
              type="button"
              onClick={() => handleDigit('8')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => handleDigit('9')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              9
            </button>
            <button
              type="button"
              onClick={() => handleOperator('+')}
              className="h-9 flex items-center justify-center rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-950 font-black text-lg border border-sky-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-9 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-[11px] border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Backspace"
            >
              Back
            </button>

            {/* Row 2: 4, 5, 6, -, Ans */}
            <button
              type="button"
              onClick={() => handleDigit('4')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              4
            </button>
            <button
              type="button"
              onClick={() => handleDigit('5')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => handleDigit('6')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => handleOperator('-')}
              className="h-9 flex items-center justify-center rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-950 font-black text-lg border border-sky-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              −
            </button>
            <button
              type="button"
              onClick={handleAns}
              className="h-9 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-[11px] border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Last Answer"
            >
              Ans
            </button>

            {/* Row 3: 1, 2, 3, ×, M+ */}
            <button
              type="button"
              onClick={() => handleDigit('1')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => handleDigit('2')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handleDigit('3')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => handleOperator('×')}
              className="h-9 flex items-center justify-center rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-950 font-black text-lg border border-sky-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              ×
            </button>
            <button
              type="button"
              onClick={handleMemoryAdd}
              className="h-9 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-[11px] border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Memory Add"
            >
              M+
            </button>

            {/* Row 4: 0, ., EXP, ÷, M- */}
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDecimal}
              className="h-9 flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 text-slate-950 font-black text-base border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              .
            </button>
            <button
              type="button"
              onClick={handleExp}
              className="h-9 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-[10px] border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer font-mono"
              title="Scientific Exponent (e)"
            >
              EXP
            </button>
            <button
              type="button"
              onClick={() => handleOperator('÷')}
              className="h-9 flex items-center justify-center rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-950 font-black text-lg border border-sky-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
            >
              ÷
            </button>
            <button
              type="button"
              onClick={handleMemorySubtract}
              className="h-9 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-[11px] border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Memory Subtract"
            >
              M−
            </button>

            {/* Row 5: ±, RND, AC, =, MR */}
            <button
              type="button"
              onClick={handleToggleSign}
              className="h-9 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-sm border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Negate Sign"
            >
              ±
            </button>
            <button
              type="button"
              onClick={handleRound}
              className="h-9 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-[10px] border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="Round to 2 decimals / Random"
            >
              RND
            </button>
            <button
              type="button"
              onClick={handleAllClear}
              className="h-9 flex items-center justify-center rounded-lg bg-rose-200 hover:bg-rose-300 text-rose-950 font-black text-xs border border-rose-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
              title="All Clear"
            >
              AC
            </button>
            <button
              type="button"
              onClick={handleEquals}
              className="h-9 flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-xl border border-blue-700 shadow-xs active:scale-95 transition-all cursor-pointer"
              title="Calculate"
            >
              =
            </button>
            <button
              type="button"
              onClick={handleMemoryRecall}
              className="h-9 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-black text-[11px] border border-slate-300 shadow-2xs active:scale-95 transition-all cursor-pointer"
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
