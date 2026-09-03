import getAppName from './getAppName';

describe('getAppName', () => {

	it('should get the app name', () => {
		expect(getAppName(true, true)).toBe('bahnotesdev-desktop');
		expect(getAppName(true, false)).toBe('bahnotes-desktop');
		expect(getAppName(false, false)).toBe('bahnotes');
		expect(getAppName(false, true)).toBe('bahnotesdev');
	});

});
