export default (isDesktop: boolean, isDev: boolean) => {
	// Keep in sync with packages/app-desktop/main.ts appName and profile dir (~/.config/bahnotes-desktop).
	let appName = isDev ? 'bahnotesdev' : 'bahnotes';
	if (isDesktop) appName += '-desktop';
	return appName;
};
