import { NextRequest, NextResponse } from "next/server";
import {
  getMobileAdapterForUser,
  getVisibleMobileUserIds,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";

// Read-only mobile endpoint for Domino stakes. Writes are deferred (Phase 3).
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const requestedOrgId =
      request.nextUrl.searchParams.get("organizationId") || undefined;

    const visibleUserIds = await getVisibleMobileUserIds(auth.user.id);

    // Collect every org the visible users can access, then fetch active stakes.
    const stakeGroups = await Promise.all(
      visibleUserIds.map(async (userId) => {
        const adapter = await getMobileAdapterForUser(userId);
        const orgs = await adapter.getOrganizations();
        const orgIds = (orgs || [])
          .map((org: any) => org.id)
          .filter((id: string) =>
            requestedOrgId ? id === requestedOrgId : true,
          );

        const perOrg = await Promise.all(
          orgIds.map((orgId: string) => adapter.getStakes(orgId)),
        );
        return perOrg.flat();
      }),
    );

    const mergedById = new Map<string, any>();
    stakeGroups.flat().forEach((stake: any) => {
      mergedById.set(stake.id, stake);
    });
    const stakes = Array.from(mergedById.values());

    return NextResponse.json(
      mobileSuccess(stakes, {
        organization_id: requestedOrgId || null,
        count: stakes.length,
        source_user_count: visibleUserIds.length,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to fetch stakes", error),
      { status: 500 },
    );
  }
}
