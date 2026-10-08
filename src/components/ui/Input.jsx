import React from "react";

export const Input = ({
  label,
  id,
  type = "text",
  placeholder = "",
  value,
  onChange,
  error = "",
  helperText = "",
  disabled = false,
  required = false,
  className = "",
  icon: Icon,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-bold text-app-primary mb-1">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {Icon && (
          <div className="absolute right-3.5 text-app-secondary pointer-events-none">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full py-2.5 rounded-xl border bg-app text-app-primary placeholder:text-app-secondary/60 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all text-sm ${
            Icon ? "pr-10 pl-3.5" : "px-3.5"
          } ${
            error ? "border-rose-500" : "border-app"
          } ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs text-app-secondary mt-1">{helperText}</p>}
    </div>
  );
};

export default Input;
