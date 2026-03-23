import React, { createContext, useContext, useState } from "react";

type ToastState = {
  open: boolean;
  kind: "error" | "info" | "success" | "warning" | "info-square" | "loading";
  title: string;
  subtitle: string;
  key: number;
};

type ToastContextType = {
  showToast: (
    kind: ToastState["kind"],
    title: string,
    subtitle: string,
  ) => void;
  hideToast: () => void;
  toastInfo: ToastState;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toastInfo, setToastInfo] = useState<ToastState>({
    open: false,
    kind: "info",
    title: "",
    subtitle: "",
    key: 0,
  });

  const showToast = (
    kind: ToastState["kind"],
    title: string,
    subtitle: string,
  ) => {
    setToastInfo({ open: true, kind, title, subtitle, key: Date.now() });
  };

  const hideToast = () => {
    setToastInfo((prev) => ({ ...prev, open: false }));
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast, toastInfo }}>
      {children}
    </ToastContext.Provider>
  );
};
