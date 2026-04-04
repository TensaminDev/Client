type Category = "conversations" | "communities";

/**
 * Executes Switch.
 * @param props Parameter props.
 * @returns unknown.
 */
export default function Switch(props: {
  category: Category;
  setCategory: (category: Category) => void;
}) {
  /**
   * Executes toggleCategory.
   * @param none This function has no parameters.
   * @returns unknown.
   */
  function toggleCategory() {
    props.setCategory(
      props.category === "conversations" ? "communities" : "conversations",
    );
  }

  return (
    <div
      role="tablist"
      className="border relative grid grid-cols-2 rounded-full bg-card p-1 select-none"
    >
      <div
        className="absolute top-1 bottom-1 rounded-full bg-input shadow-sm transition-all duration-300 ease-in-out"
        style={{
          left: props.category === "conversations" ? "0.25rem" : "50%",
          width: "calc(50% - 0.25rem)",
        }}
      />
      <button
        role="tab"
        aria-selected={props.category === "conversations"}
        className={`relative z-10 w-full cursor-pointer rounded-full px-2.5 py-1.5 text-center text-sm font-medium transition-colors duration-300 ${
          props.category === "conversations"
            ? "text-foreground"
            : "text-ring/50 hover:text-ring"
        }`}
        onClick={toggleCategory}
      >
        Conversations
      </button>
      <button
        role="tab"
        aria-selected={props.category === "communities"}
        className={`relative z-10 w-full cursor-pointer rounded-full px-2.5 py-1.5 text-center text-sm font-medium transition-colors duration-300 ${
          props.category === "communities"
            ? "text-foreground"
            : "text-ring/50 hover:text-ring"
        }`}
        onClick={toggleCategory}
      >
        Communities
      </button>
    </div>
  );
}
