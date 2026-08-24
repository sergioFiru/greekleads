// Greek number formatting.
//
// el-GR uses '.' for thousands and ',' for decimals — the opposite of en-US.
// toLocaleString() gets this right, but a bare toFixed() does not, which is how
// "14.7%" ended up next to "70.077" on the same screen. Percentages go through
// here so the two conventions can never disagree again.

export function pct(value: number, digits = 1): string {
  return value.toLocaleString('el-GR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + '%'
}

export function num(value: number): string {
  return value.toLocaleString('el-GR')
}
