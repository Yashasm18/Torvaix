/** The message from a failed API response (`{ error, details? }`), or its HTTP status. */
export async function responseError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null)
  if (data && typeof data.error === "string" && data.error) {
    return typeof data.details === "string" && data.details ? `${data.error}: ${data.details}` : data.error
  }
  return `The server returned HTTP ${res.status}.`
}

/** Message for a request that never got a response (the web app itself is unreachable). */
export const NO_RESPONSE = "Couldn't reach Torvaix. Check that it's still running."
