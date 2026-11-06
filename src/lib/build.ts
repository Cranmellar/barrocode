declare const __BUILD__: { commit: string; date: string };

/** The barrocode a saved file came from: the commit it was built from ('dev' outside a build) and the build's date. */
export const BUILD: { commit: string; date: string } = __BUILD__;

/** "fe7b4ac (2026-11-06)", or just the commit when there is no date. */
export const versionLabel = (commit: string, date: string) => date ? `${commit} (${date})` : commit;
