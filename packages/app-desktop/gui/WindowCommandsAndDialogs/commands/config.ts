import { CommandRuntime, CommandDeclaration, CommandContext } from '@joplin/lib/services/CommandService';
import { _ } from '@joplin/lib/locale';
import shim from '@joplin/lib/shim';
import NavService from '@joplin/lib/services/NavService';

export const declaration: CommandDeclaration = {
	name: 'config',
	label: () => shim.isMac() ? _('Preferences') : _('Options'),
	iconName: 'fas fa-cog',
};

export const runtime = (): CommandRuntime => {
	return {
		execute: async (_context: CommandContext) => {
			await NavService.go('Config');
		},
	};
};
