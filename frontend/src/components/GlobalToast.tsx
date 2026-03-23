import { useToast } from "../contexts/ToastContext";
import React, { useEffect, useState } from "react";

const TRANSITION_DURATION = 300; // ms
const AUTO_DISMISS = 3000; // ms

const GlobalToast = () => {
  const { toastInfo, hideToast } = useToast();
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (toastInfo.open) {
      setMounted(true);
      setTimeout(() => setShow(true), 10); // allow mount before fade-in
      const timer = setTimeout(() => {
        setShow(false);
        setTimeout(() => {
          setMounted(false);
          hideToast();
        }, TRANSITION_DURATION);
      }, AUTO_DISMISS);
      return () => clearTimeout(timer);
    } else {
      setShow(false);
      setTimeout(() => setMounted(false), TRANSITION_DURATION);
    }
  }, [toastInfo.open, hideToast]);

  if (!mounted) return null;

  // Custom loading toast
  if (toastInfo.kind === "loading") {
    return (
      <div
        className={`fixed top-4 right-4 z-[9999] bg-white border border-gray-200 shadow-lg rounded-xl px-6 py-4 flex items-center gap-4 transition-all duration-300 ${
          show ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
        style={{ pointerEvents: show ? "auto" : "none" }}
      >
        <svg
          className="animate-spin h-6 w-6 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8z"
          ></path>
        </svg>
        <div>
          <h5 className="text-base font-semibold text-gray-900 m-0">
            {toastInfo.title}
          </h5>
          <p className="text-sm text-gray-600 m-0">{toastInfo.subtitle}</p>
        </div>
      </div>
    );
  }

  // Custom notification toast
  const kindStyles: Record<string, string> = {
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
  };
  const style =
    kindStyles[toastInfo.kind] || "bg-white border-gray-200 text-gray-900";

  return (
    <div
      className={`fixed top-4 right-4 z-[9999] border shadow-lg rounded-xl px-6 py-4 flex items-start gap-4 transition-all duration-300 ${style} ${
        show ? "opacity-100 scale-100" : "opacity-0 scale-95"
      }`}
      role="alert"
      style={{ pointerEvents: show ? "auto" : "none" }}
    >
      <button
        onClick={() => {
          setShow(false);
          setTimeout(() => {
            setMounted(false);
            hideToast();
          }, TRANSITION_DURATION);
        }}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 p-1 rounded-full focus:outline-none"
        aria-label="Close notification"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
      <div>
        <h5 className="text-base font-semibold m-0">{toastInfo.title}</h5>
        <p className="text-sm m-0">{toastInfo.subtitle}</p>
      </div>
    </div>
  );
};

export default GlobalToast;
