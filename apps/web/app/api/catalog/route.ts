export const dynamic = "force-dynamic";
import { CARE_NEEDS, CARE_NEED_GROUPS, homeCommitments, POLICY, WEEKDAYS, RATING_AREAS, PLUS, WEEKLY_BILLING_FROM_DAYS } from "@uday/core";
import { handle } from "@/lib/http";
/** Shared lists for the mobile apps, so the app and website never disagree. */
export const GET = handle(async () => ({ careNeeds: CARE_NEEDS, careNeedGroups: CARE_NEED_GROUPS, commitments: { day: homeCommitments("day"), night: homeCommitments("night"), live: homeCommitments("live") },
  platformFeeBps: POLICY.platformFeeBps, gstBps: POLICY.gstOnPlatformFeeBps, weekdays: WEEKDAYS, ratingAreas: RATING_AREAS, plus: PLUS, weeklyFrom: WEEKLY_BILLING_FROM_DAYS }));
