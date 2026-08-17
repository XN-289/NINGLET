/**
 * NINGLET novel panel — host half. Pure surface plugin: the empty apply exists
 * so the plugin appears in the host cordis.yml / Loader; the browser half ships
 * via exports["./client"], discovered through the package.json dsh.client
 * declaration (same pattern as dsh-client-ui-message-feedback).
 * @module @deepseek-ai/dsh-client-ninglet
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
