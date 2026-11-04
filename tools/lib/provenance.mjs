export const MODEL_BACKENDS = ["primary-agent", "subagent", "primary-agent+subagent", "codex-cli", "claude-code-cli"];

export function validateRunnerMetrics(metrics,name) {
  if(!metrics||typeof metrics.runtime!=="string"||!Number.isFinite(metrics.elapsed_ms)||metrics.elapsed_ms<0||!(metrics.cost_usd===null||(Number.isFinite(metrics.cost_usd)&&metrics.cost_usd>=0)))throw new Error(`${name}: invalid runner metrics`);
}
