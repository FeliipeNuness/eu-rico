// Synthetic configuration is restricted to this test server, never to the product.
process.env.VITE_SUPABASE_URL = 'https://launch-test.supabase.co'
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_synthetic_e2e_only'
const { createServer } = await import('vite')
const server = await createServer({ configLoader: 'runner', server: { host: '127.0.0.1', port: 4174, strictPort: true } })
await server.listen()
