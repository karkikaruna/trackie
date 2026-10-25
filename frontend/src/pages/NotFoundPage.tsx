import { Link } from "react-router-dom";
import { Button, EmptyState } from "../components/ui";

export default function NotFoundPage({ message }: { message?: string }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        title="Page not found"
        description={message ?? "The page you're looking for doesn't exist."}
        action={<Link to="/dashboard"><Button>Back to dashboard</Button></Link>}
      />
    </div>
  );
}
