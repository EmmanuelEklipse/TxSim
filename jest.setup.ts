const originalWarn = console.warn;
console.warn = (...args) => {
    if (
        typeof args[0] === "string" &&
        args[0].includes("has multiple versions") &&
        (args[0].includes("@polkadot/") ||
            args[0].includes("conflicting packages were found"))
    ) {
        return;
    }
    originalWarn(...args);
};
