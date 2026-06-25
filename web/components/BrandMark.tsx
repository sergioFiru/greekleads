export default function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <rect x="1" y="1" width="12" height="12" stroke="#E8EDF5" strokeWidth="1.4" />
      <rect x="9" y="9" width="12" height="12" fill="#2563A8" />
    </svg>
  )
}
