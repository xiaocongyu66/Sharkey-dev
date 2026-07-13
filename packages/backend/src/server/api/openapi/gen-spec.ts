/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import endpoints, { IEndpoint } from '../endpoints.js';
import { errors as basicErrors } from './errors.js';
import { getSchemas, convertSchemaToOpenApiSchema } from './schemas.js';

export function genOpenapiSpec(config: Config, includeSelfRef = false) {
	const spec = {
		openapi: '3.1',

		info: {
			version: config.version,
			title: 'Sharkey API',
			description: [
				'HTTP API for this Sharkey instance (Misskey fork).',
				'',
				'## Authentication',
				'',
				'Preferred: `Authorization: Bearer <token>` (RFC 6750).',
				'',
				'Legacy (still accepted): JSON body field `i` on POST, or query `i` on **GET** endpoints that set `allowGet`.',
				'**Do not put long-lived tokens in URLs** when you can avoid it (proxy logs / Referer). Prefer Bearer for HTTP.',
				'',
				'WebSocket streaming (`/streaming`): modern clients send the token via `Sec-WebSocket-Protocol`',
				'(`misskey` + `misskey.i.<token>`). Legacy `?i=` remains accepted for older clients.',
				'',
				'## Credentials & permissions',
				'',
				'- **Credential required**: needs a user or app access token.',
				'- **Permission (`kind`)**: app tokens must include this scope (e.g. `write:notes`).',
				'- **Moderator / Administrator**: role flags; not the same as app scopes alone.',
				'- **Internal (`secure`)**: intended for the first-party web client only; third-party apps should not call these.',
				'',
				'## Interactive docs',
				'',
				`Human-readable explorer (public, no login): ${config.url}/api-doc`,
				'',
				'Machine-readable OpenAPI 3.1: `/api.json` (**public**).',
				'',
				'## Notes',
				'',
				'- Extra JSON properties are generally ignored (handlers pick known fields); do not rely on mass-assignment.',
				'- Rate limits return HTTP 429 when configured on an endpoint.',
				'- API catalog (`/api.json`, `/api/endpoints`, `/api/endpoint`, `/api-doc`) is open to everyone; only *calling* protected endpoints needs a token.',
			].join('\n'),
			// contact omitted — instance-specific
		},

		externalDocs: {
			description: 'Sharkey upstream repository',
			url: 'https://activitypub.software/TransFem-org/Sharkey',
		},

		servers: [{
			url: config.apiUrl,
			description: 'This instance API base',
		}],

		tags: [
			{ name: 'account', description: 'Account / profile' },
			{ name: 'admin', description: 'Moderator / administrator' },
			{ name: 'chat', description: 'Direct messages and chat rooms' },
			{ name: 'drive', description: 'Drive files and folders' },
			{ name: 'notes', description: 'Notes (posts)' },
			{ name: 'users', description: 'Users' },
			{ name: 'flashs', description: 'Play / Flash (AiScript pages)' },
			{ name: 'meta', description: 'Instance meta' },
		],

		paths: {} as any,

		components: {
			schemas: getSchemas(includeSelfRef),

			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					description: [
						'User or app access token (preferred).',
						'Legacy alternative: JSON body field `i` on POST, or query `i` on allowGet endpoints (avoid putting tokens in URLs).',
					].join(' '),
				},
			},
		},
	};

	// 書き換えたりするのでディープコピーしておく。そのまま編集するとメモリ上の値が汚れて次回以降の出力に影響する
	const copiedEndpoints = JSON.parse(JSON.stringify(endpoints)) as IEndpoint[];
	for (const endpoint of copiedEndpoints) {
		const errors = {} as any;

		if (endpoint.meta.errors) {
			for (const e of Object.values(endpoint.meta.errors)) {
				errors[e.code] = {
					value: {
						error: e,
					},
				};
			}
		}

		const resSchema = endpoint.meta.res ? convertSchemaToOpenApiSchema(endpoint.meta.res, 'res', includeSelfRef) : {};

		let desc = (endpoint.meta.description ? endpoint.meta.description : 'No description provided.') + '\n\n';

		if (endpoint.meta.secure) {
			desc += '**Internal endpoint**: first-party web client only; not for third-party apps.\n\n';
		}

		if (endpoint.meta.stability === 'deprecated') {
			desc += '**Stability**: deprecated — avoid new integrations.\n\n';
		} else if (endpoint.meta.stability === 'experimental') {
			desc += '**Stability**: experimental — may change without notice.\n\n';
		}

		desc += `**Credential required**: *${endpoint.meta.requireCredential ? 'Yes' : 'No'}*`;
		if (endpoint.meta.requireModerator) {
			desc += ' / **Moderator**: *Yes*';
		}
		if (endpoint.meta.requireAdmin) {
			desc += ' / **Administrator**: *Yes*';
		}
		if (endpoint.meta.kind) {
			desc += ` / **Permission**: *${endpoint.meta.kind}*`;
		}
		if (endpoint.meta.requiredRolePolicy) {
			desc += ` / **Role policy**: *${endpoint.meta.requiredRolePolicy}*`;
		}
		if (endpoint.meta.allowGet) {
			desc += '\n\n**GET allowed**: yes (query parameters map to the same fields as the JSON body; avoid putting tokens in query strings).';
		}
		if (endpoint.meta.limit) {
			const lim = endpoint.meta.limit as { duration?: number; max?: number; minInterval?: number };
			const parts: string[] = [];
			if (lim.max != null && lim.duration != null) {
				parts.push(`${lim.max} calls / ${lim.duration}ms`);
			}
			if (lim.minInterval != null) {
				parts.push(`min interval ${lim.minInterval}ms`);
			}
			if (parts.length) {
				desc += `\n\n**Rate limit**: ${parts.join(', ')}.`;
			}
		}

		const requestType = endpoint.meta.requireFile ? 'multipart/form-data' : 'application/json';
		const schema = { ...convertSchemaToOpenApiSchema(endpoint.params, 'param', false) };

		if (endpoint.meta.requireFile) {
			schema.properties = {
				...schema.properties,
				file: {
					type: 'string',
					format: 'binary',
					description: 'The file contents.',
				},
			};
			schema.required = [...schema.required ?? [], 'file'];
		}

		if (schema.required && schema.required.length <= 0) {
			// 空配列は許可されない
			schema.required = undefined;
		}

		const hasBody = (schema.type === 'object' && schema.properties && Object.keys(schema.properties).length >= 1);

		const needsAuth = !!(endpoint.meta.requireCredential || endpoint.meta.requireModerator || endpoint.meta.requireAdmin);

		const info = {
			operationId: endpoint.name.replaceAll('/', '___'), // NOTE: スラッシュは使えない
			summary: endpoint.name,
			description: desc,
			externalDocs: {
				description: 'Source code',
				url: `https://activitypub.software/TransFem-org/Sharkey/-/tree/develop/packages/backend/src/server/api/endpoints/${endpoint.name}.ts`,
			},
			...(endpoint.meta.tags ? {
				tags: [endpoint.meta.tags[0]],
			} : {}),
			...(needsAuth ? {
				security: [{
					bearerAuth: [],
				}],
			} : {}),
			...(hasBody ? {
				requestBody: {
					required: true,
					content: {
						[requestType]: {
							schema,
						},
					},
				},
			} : {}),
			responses: {
				...(endpoint.meta.res ? {
					'200': {
						description: 'OK (with results)',
						content: {
							'application/json': {
								schema: resSchema,
							},
						},
					},
				} : {
					'204': {
						description: 'OK (without any results)',
					},
				}),
				...(endpoint.meta.res?.optional === true || endpoint.meta.res?.nullable === true ? {
					'204': {
						description: 'OK (without any results)',
					},
				} : {}),
				'400': {
					description: 'Client error',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: { ...errors, ...basicErrors['400'] },
						},
					},
				},
				'401': {
					description: 'Authentication error',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: basicErrors['401'],
						},
					},
				},
				'403': {
					description: 'Forbidden error',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: basicErrors['403'],
						},
					},
				},
				'418': {
					description: 'I\'m Ai',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: basicErrors['418'],
						},
					},
				},
				...(endpoint.meta.limit ? {
					'429': {
						description: 'Too many requests',
						content: {
							'application/json': {
								schema: {
									$ref: '#/components/schemas/Error',
								},
								examples: basicErrors['429'],
							},
						},
					},
				} : {}),
				'500': {
					description: 'Internal server error',
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/Error',
							},
							examples: basicErrors['500'],
						},
					},
				},
			},
		};

		const { requestBody: postBody, ...infoWithoutBody } = info as typeof info & { requestBody?: unknown };

		spec.paths['/' + endpoint.name] = {
			...(endpoint.meta.allowGet ? {
				get: {
					...infoWithoutBody,
					operationId: 'get___' + info.operationId,
					description: info.description + '\n\nThis operation allows **GET** (query string parameters mirror the request body schema). Avoid tokens in the query string; use Bearer when the client can set headers.',
					...(hasBody ? {
						parameters: Object.entries(schema.properties ?? {}).map(([name, prop]: [string, any]) => ({
							name,
							in: 'query',
							required: Array.isArray(schema.required) && schema.required.includes(name),
							schema: prop,
							description: typeof prop?.description === 'string' ? prop.description : undefined,
						})),
					} : {}),
				},
			} : {}),
			post: {
				...info,
				operationId: 'post___' + info.operationId,
				...(postBody ? { requestBody: postBody } : {}),
			},
		};
	}

	return spec;
}
