import pino from "pino";

const logger = pino({
    formatters: {
        level(label) {
            return { level: label };
        }
    }
});

export default logger;