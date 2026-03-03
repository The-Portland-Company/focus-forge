import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import ical, { ICalCalendarMethod, ICalEventBusyStatus } from "ical-generator";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing token parameter" },
        { status: 400 },
      );
    }

    const supabase = await createServiceClient();

    // Validate token and get user (cast column name to bypass generated types lag)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .eq("calendar_feed_token" as any, token)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 },
      );
    }

    // Get user's organizations to find their projects
    const { data: userOrgs } = await supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", profile.id);

    const orgIds = userOrgs?.map((uo: any) => uo.organization_id) || [];

    let projectIds: string[] = [];
    if (orgIds.length > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id")
        .in("organization_id", orgIds);
      projectIds = projects?.map((p: any) => p.id) || [];
    }

    // Fetch non-completed tasks for the user
    let query = supabase
      .from("tasks")
      .select("*")
      .eq("completed", false)
      .order("due_date", { ascending: true });

    if (projectIds.length > 0) {
      query = query.or(
        `assigned_to.eq.${profile.id},and(assigned_to.is.null,project_id.in.(${projectIds.join(",")}))`,
      );
    } else {
      query = query.eq("assigned_to", profile.id);
    }

    const { data: tasks, error: tasksError } = await query;

    if (tasksError) {
      console.error("Calendar feed - tasks query error:", tasksError);
      return NextResponse.json(
        { error: "Failed to fetch tasks" },
        { status: 500 },
      );
    }

    // Build calendar
    const displayName =
      `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
      profile.email;

    const calendar = ical({
      name: `Focus Forge - ${displayName}`,
      method: ICalCalendarMethod.PUBLISH,
      prodId: { company: "FocusForge", product: "TaskCalendar" },
    });

    for (const rawTask of tasks || []) {
      // Cast to any since generated types may lag behind schema
      const task = rawTask as any;
      const hasStart = task.start_date != null;
      const hasEnd = task.end_date != null;
      const hasDue = task.due_date != null;

      if (hasStart && hasEnd) {
        // Full event with start and end
        const startDt = buildDateTime(task.start_date, task.start_time);
        const endDt = buildDateTime(task.end_date, task.end_time);

        calendar.createEvent({
          id: task.id,
          summary: task.name,
          description: task.description || undefined,
          start: startDt,
          end: endDt,
          busystatus: ICalEventBusyStatus.BUSY,
          priority: mapPriority(task.priority),
        });
      } else if (hasStart) {
        // Start-only: 1-hour event or all-day
        const startDt = buildDateTime(task.start_date, task.start_time);
        const allDay = !task.start_time;

        if (allDay) {
          calendar.createEvent({
            id: task.id,
            summary: task.name,
            description: task.description || undefined,
            start: startDt,
            allDay: true,
            busystatus: ICalEventBusyStatus.BUSY,
            priority: mapPriority(task.priority),
          });
        } else {
          const endDt = new Date(startDt.getTime() + 60 * 60 * 1000);
          calendar.createEvent({
            id: task.id,
            summary: task.name,
            description: task.description || undefined,
            start: startDt,
            end: endDt,
            busystatus: ICalEventBusyStatus.BUSY,
            priority: mapPriority(task.priority),
          });
        }
      } else if (hasDue) {
        // Due-date only: all-day event or point-in-time
        const dueDt = buildDateTime(task.due_date, task.due_time);
        const allDay = !task.due_time;

        if (allDay) {
          calendar.createEvent({
            id: task.id,
            summary: task.name,
            description: task.description || undefined,
            start: dueDt,
            allDay: true,
            busystatus: ICalEventBusyStatus.FREE,
            priority: mapPriority(task.priority),
          });
        } else {
          const endDt = new Date(dueDt.getTime() + 30 * 60 * 1000);
          calendar.createEvent({
            id: task.id,
            summary: task.name,
            description: task.description || undefined,
            start: dueDt,
            end: endDt,
            busystatus: ICalEventBusyStatus.FREE,
            priority: mapPriority(task.priority),
          });
        }
      }
      // Tasks with no dates are skipped
    }

    const icsString = calendar.toString();

    return new NextResponse(icsString, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Calendar feed error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function buildDateTime(dateStr: string, timeStr?: string | null): Date {
  if (timeStr) {
    return new Date(`${dateStr}T${timeStr}`);
  }
  return new Date(`${dateStr}T00:00:00`);
}

function mapPriority(p: number | null): number {
  // iCal priority: 1 = highest, 9 = lowest, 0 = undefined
  switch (p) {
    case 1:
      return 1;
    case 2:
      return 3;
    case 3:
      return 5;
    case 4:
      return 9;
    default:
      return 0;
  }
}
