// Fallback for a hash that matches no route in router.tsx.
export function NotFoundPage() {
  return (
    <section>
      <h1>Not found</h1>
      <p>
        That page does not exist. <a href="#/">Go home</a>.
      </p>
    </section>
  );
}
