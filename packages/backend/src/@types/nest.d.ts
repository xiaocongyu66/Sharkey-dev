/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors; originally based on code by syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ModuleMetadata } from '@nestjs/common';

declare module '@nestjs/common' {
	export type Import = NonNullable<ModuleMetadata['imports']>[number];
}
