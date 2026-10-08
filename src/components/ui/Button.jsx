import React from "react";

export const Button = ({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  disabled = false,
  className = "",
  onClick,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer gap-2";

  const variants = {
    primary: "btn-app-primary text-white shadow-sm",
    secondary: "bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-app-primary",
    danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm",
    outline: "border border-app hover:bg-black/5 dark:hover:bg-white/10 text-app-primary",
    ghost: "hover:bg-black/5 dark:hover:bg-white/10 text-app-primary",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base font-semibold",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
