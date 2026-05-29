export default function App() {
  return (
    <main className="flex flex-col justify-center items-center grow">
      <label htmlFor="query" className="mb-2">Enter your query:</label>
      <input type="text" id="query" className="border p-2 rounded-md" />
    </main>
  )
}