/**
 * Chat text for an action that is waiting for approval. The web app reads only the id from it
 * and loads the command itself from the server, so text in a model reply can't change what the
 * approval card shows.
 */
export function formatApprovalRequest(pendingActionId: string, tool?: string): string {
  return [
    '',
    '',
    '**SECURITY LAYER TRIGGERED**',
    `The agent wants to run \`${tool ?? 'a tool'}\` and is waiting for your approval.`,
    `Pending Action ID: \`${pendingActionId}\``,
  ].join('\n');
}
