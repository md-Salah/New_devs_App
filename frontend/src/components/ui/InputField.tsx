export const InputField = ({
  value,
  handleChange,
  label,
  placeHolder,
  disabled = false,
  type = "text",
  required,
}: {
  value: string | undefined;
  handleChange: (newValue: string) => void;
  label: string;
  placeHolder: string;
  disabled?: boolean;
  type?: "text" | "date" | "number";
  required?: boolean;
}) => {
  const inputId = label.toLowerCase().replace(" ", "_");
  return (
    <span className="flex flex-col gap-y-1 w-full">
      <label
        htmlFor={inputId}
        className="text-[#09090B] font-medium text-base flex"
      >
        <p>{label}</p>
        {required && <p className="text-red-500">*</p>}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => handleChange(e.target.value)}
        name={inputId}
        disabled={disabled}
        id={inputId}
        placeholder={placeHolder}
        className="border border-[#E2E8F0] rounded-md px-4 py-[10px] bg-white outline-none focus:ring-2 ring-[#5070FE] placeholder:text-[#71717A] placeholder:text-sm text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </span>
  );
};
