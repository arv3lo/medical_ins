/** Escapes LIKE wildcards so that user input matches literally (the default escape is \). */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);
