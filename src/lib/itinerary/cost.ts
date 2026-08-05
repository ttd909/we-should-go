export function estimateItineraryCost(inputTokens: number, outputTokens: number): number {
  const inputPerMillion = Number(process.env.ITINERARY_INPUT_COST_PER_MILLION ?? 3)
  const outputPerMillion = Number(process.env.ITINERARY_OUTPUT_COST_PER_MILLION ?? 15)
  return (inputTokens * inputPerMillion + outputTokens * outputPerMillion) / 1_000_000
}
