import React from "react";

export const Card = ({
  children,
  className = "",
  onClick,
  ...props
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-card-app border border-app rounded-2xl p-5 shadow-xs transition-all duration-200 ${
        onClick ? "cursor-pointer hover:shadow-md hover:border-app-secondary" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ title, subtitle, action, className = "" }) => {
  return (
    <div className={`flex items-start justify-between mb-4 pb-3 border-b border-app ${className}`}>
      <div>
        {title && <h3 className="text-lg font-bold text-app-primary">{title}</h3>}
        {subtitle && <p className="text-xs text-app-secondary mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

export default Card;
