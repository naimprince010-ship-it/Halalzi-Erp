export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="form-error" role="alert">
      {message}
    </div>
  );
}
