import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, PageHeader } from "../components/ui";
import IssueList from "../features/issues/IssueList";
import type { IssueFilters } from "../types/api";
import { filtersFromParams, paramsFromFilters } from "../utils/filters";

export default function IssuesPage() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(sp), [sp]);
  // Filters live in the URL so a filtered view can be bookmarked, shared, and survives refresh.
  const onChange = useCallback((f: IssueFilters) => setSp(paramsFromFilters(f), { replace: true }), [setSp]);

  return (
    <>
      <PageHeader
        title="Issues"
        description="Search and filter issues across all your projects."
        actions={<Link to={`/issues/new${filters.project_id ? `?project=${filters.project_id}` : ""}`}><Button>New issue</Button></Link>}
      />
      <IssueList
        filters={filters}
        onChange={onChange}
        emptyAction={<Link to="/issues/new"><Button>Create an issue</Button></Link>}
      />
    </>
  );
}
