export default function SkeletonRows({ cols = 8, rows = 10 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} style={{ padding: "10px 10px", background: "var(--g-card)", borderRadius: j === 0 ? "12px 0 0 12px" : j === cols - 1 ? "0 12px 12px 0" : undefined }}>
              <div style={{ height: 12, borderRadius: 6, background: `rgba(120,135,160,${0.08 + (j % 3) * 0.03})`, animationName: "pulse", animationDuration: "1.5s", animationIterationCount: "infinite", animationTimingFunction: "ease-in-out" }} />
            </td>
          ))}
        </tr>
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
    </>
  );
}
