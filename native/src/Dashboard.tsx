export default function Dashboard() {
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#09090b',
        color: '#f4f4f5',
        padding: 'calc(env(safe-area-inset-top, 0px) + 48px) 24px 32px',
        fontFamily: 'Arial, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <h1 style={{ color: '#fb923c', textAlign: 'center' }}>
        SWORD AND SHIELD
      </h1>

      <h2>Dashboard</h2>

      <p>Secure authentication successful.</p>
      <p>Your native training dashboard is coming next.</p>
    </main>
  )
}