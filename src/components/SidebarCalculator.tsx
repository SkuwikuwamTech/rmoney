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
            className="relative px-3 py-2 rounded-lg shadow-inner cursor-pointer hover:brightness-110 transition-all text-right group"
            style={{ backgroundColor: '#0d233a', color: '#ffffff', borderColor: '#1e4976', borderWidth: '2px', borderStyle: 'solid' }}
            title="Click to copy value"
          >
            {/* Calculation history indicator */}
            <div
              className="text-xs font-mono font-semibold h-4 leading-4 truncate overflow-hidden"
              style={{ color: '#7dd3fc' }}
            >
              {prevValue !== null && operation ? `${prevValue} ${operation}` : memory !== 0 ? `M = ${memory}` : ''}
            </div>

            {/* Main number display */}
            <div
              className="text-2xl font-black font-mono tracking-wide leading-tight truncate drop-shadow-xs"
              style={{ color: '#ffffff' }}
            >
              {formatDisplay(display)}
            </div>

            {copied && (
              <span
                className="absolute left-2.5 bottom-2 text-[10px] font-sans font-bold px-2 py-0.5 rounded shadow"
                style={{ backgroundColor: '#10b981', color: '#ffffff' }}
              >
                Copied
              </span>
            )}
          </div>

          {/* 5x5 Keypad with guaranteed explicit colors & high contrast */}
          <div className="grid grid-cols-5 gap-1.5 text-xs font-bold">
            {/* Row 1: 7, 8, 9, +, Back */}
            <button
              type="button"
              onClick={() => handleDigit('7')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              7
            </button>
            <button
              type="button"
              onClick={() => handleDigit('8')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              8
            </button>
            <button
              type="button"
              onClick={() => handleDigit('9')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              9
            </button>
            <button
              type="button"
              onClick={() => handleOperator('+')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#bae6fd', color: '#082f49', borderColor: '#7dd3fc', borderWidth: '1px', borderStyle: 'solid' }}
            >
              +
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-9 flex items-center justify-center rounded-lg font-black text-xs shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#334155', color: '#ffffff', borderColor: '#475569', borderWidth: '1px', borderStyle: 'solid' }}
              title="Backspace"
            >
              Back
            </button>

            {/* Row 2: 4, 5, 6, -, Ans */}
            <button
              type="button"
              onClick={() => handleDigit('4')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              4
            </button>
            <button
              type="button"
              onClick={() => handleDigit('5')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              5
            </button>
            <button
              type="button"
              onClick={() => handleDigit('6')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              6
            </button>
            <button
              type="button"
              onClick={() => handleOperator('-')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#bae6fd', color: '#082f49', borderColor: '#7dd3fc', borderWidth: '1px', borderStyle: 'solid' }}
            >
              −
            </button>
            <button
              type="button"
              onClick={handleAns}
              className="h-9 flex items-center justify-center rounded-lg font-black text-xs shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#334155', color: '#ffffff', borderColor: '#475569', borderWidth: '1px', borderStyle: 'solid' }}
              title="Last Answer"
            >
              Ans
            </button>

            {/* Row 3: 1, 2, 3, ×, M+ */}
            <button
              type="button"
              onClick={() => handleDigit('1')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              1
            </button>
            <button
              type="button"
              onClick={() => handleDigit('2')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handleDigit('3')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              3
            </button>
            <button
              type="button"
              onClick={() => handleOperator('×')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#bae6fd', color: '#082f49', borderColor: '#7dd3fc', borderWidth: '1px', borderStyle: 'solid' }}
            >
              ×
            </button>
            <button
              type="button"
              onClick={handleMemoryAdd}
              className="h-9 flex items-center justify-center rounded-lg font-black text-xs shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#334155', color: '#ffffff', borderColor: '#475569', borderWidth: '1px', borderStyle: 'solid' }}
              title="Memory Add"
            >
              M+
            </button>

            {/* Row 4: 0, ., EXP, ÷, M- */}
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDecimal}
              className="h-9 flex items-center justify-center rounded-lg font-black text-base shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#1e293b', color: '#ffffff', borderColor: '#334155', borderWidth: '1px', borderStyle: 'solid' }}
            >
              .
            </button>
            <button
              type="button"
              onClick={handleExp}
              className="h-9 flex items-center justify-center rounded-lg font-black text-[11px] shadow-2xs active:scale-95 transition-all cursor-pointer font-mono"
              style={{ backgroundColor: '#334155', color: '#ffffff', borderColor: '#475569', borderWidth: '1px', borderStyle: 'solid' }}
              title="Scientific Exponent (e)"
            >
              EXP
            </button>
            <button
              type="button"
              onClick={() => handleOperator('÷')}
              className="h-9 flex items-center justify-center rounded-lg font-black text-lg shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#bae6fd', color: '#082f49', borderColor: '#7dd3fc', borderWidth: '1px', borderStyle: 'solid' }}
            >
              ÷
            </button>
            <button
              type="button"
              onClick={handleMemorySubtract}
              className="h-9 flex items-center justify-center rounded-lg font-black text-xs shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#334155', color: '#ffffff', borderColor: '#475569', borderWidth: '1px', borderStyle: 'solid' }}
              title="Memory Subtract"
            >
              M−
            </button>

            {/* Row 5: ±, RND, AC, =, MR */}
            <button
              type="button"
              onClick={handleToggleSign}
              className="h-9 flex items-center justify-center rounded-lg font-black text-sm shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#334155', color: '#ffffff', borderColor: '#475569', borderWidth: '1px', borderStyle: 'solid' }}
              title="Negate Sign"
            >
              ±
            </button>
            <button
              type="button"
              onClick={handleRound}
              className="h-9 flex items-center justify-center rounded-lg font-black text-[11px] shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#334155', color: '#ffffff', borderColor: '#475569', borderWidth: '1px', borderStyle: 'solid' }}
              title="Round to 2 decimals / Random"
            >
              RND
            </button>
            <button
              type="button"
              onClick={handleAllClear}
              className="h-9 flex items-center justify-center rounded-lg font-black text-xs shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#fecdd3', color: '#881337', borderColor: '#fda4af', borderWidth: '1px', borderStyle: 'solid' }}
              title="All Clear"
            >
              AC
            </button>
            <button
              type="button"
              onClick={handleEquals}
              className="h-9 flex items-center justify-center rounded-lg font-black text-xl shadow-xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#2563eb', color: '#ffffff', borderColor: '#1d4ed8', borderWidth: '1px', borderStyle: 'solid' }}
              title="Calculate"
            >
              =
            </button>
            <button
              type="button"
              onClick={handleMemoryRecall}
              className="h-9 flex items-center justify-center rounded-lg font-black text-xs shadow-2xs active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: '#334155', color: '#ffffff', borderColor: '#475569', borderWidth: '1px', borderStyle: 'solid' }}
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
