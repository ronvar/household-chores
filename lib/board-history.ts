export function isVisibleBoardChange(event: { actor_name: string; message: string }) {
  const prefix = `${event.actor_name} `;
  if (!event.message.startsWith(prefix)) return false;
  const action = event.message.slice(prefix.length);
  if (/^(?:offered .+ to .+ for .+|accepted .+'s trade: .+|declined .+'s trade request|cancelled the trade request)$/.test(action)) return true;
  if (/^added .+ \(\d+pt, .+\)$/.test(action)) return true;
  if (/^removed .+ from future schedules$/.test(action)) return true;
  if (!action.startsWith("changed ")) return false;
  return /(?:^|: |, )\d+pt → \d+pt(?:, |$)/.test(action);
}
