import { NextRequest, NextResponse } from 'next/server'
import {
  createServiceSupabase,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessToken,
} from '@/lib/mobile/api'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyAccountLinkToken } from '@/lib/mobile/account-link'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessToken(
      request.headers.get('authorization'),
    )
    if (!auth.ok) {
      console.error('❌ account link complete auth failed:', auth.error.error)
      return NextResponse.json(auth.error, { status: auth.status })
    }

    const body = await request.json()
    const linkToken = String(body?.link_token || '')
    const transferTaskOwnership = Boolean(body?.transfer_task_ownership)

    if (!linkToken) {
      return NextResponse.json(
        mobileFailure('missing_link_token', 'link_token is required'),
        { status: 400 },
      )
    }

    let tokenPayload: Awaited<ReturnType<typeof verifyAccountLinkToken>>
    try {
      tokenPayload = await verifyAccountLinkToken(linkToken)
    } catch {
      return NextResponse.json(
        mobileFailure(
          'invalid_link_token',
          'link_token is invalid or expired; verify again',
        ),
        { status: 401 },
      )
    }

    if (tokenPayload.target_user_id !== auth.user.id) {
      return NextResponse.json(
        mobileFailure(
          'link_target_mismatch',
          'link token does not match the current user',
        ),
        { status: 403 },
      )
    }

    const sourceUserId = tokenPayload.source_user_id
    if (!sourceUserId || sourceUserId === auth.user.id) {
      return NextResponse.json(
        mobileFailure(
          'invalid_link_source',
          'invalid source account for linking',
        ),
        { status: 400 },
      )
    }

    const admin = getAdminClient()
    const { data: sourceData, error: sourceError } = await admin.auth.admin.getUserById(
      sourceUserId,
    )
    if (sourceError || !sourceData?.user) {
      return NextResponse.json(
        mobileFailure('source_not_found', 'Source account no longer exists'),
        { status: 404 },
      )
    }

    const linkedTo = sourceData.user.app_metadata?.linked_to_user_id
    if (linkedTo && linkedTo !== auth.user.id) {
      return NextResponse.json(
        mobileFailure(
          'source_already_linked',
          'This source account is already linked to another user',
        ),
        { status: 409 },
      )
    }

    const serviceSupabase = createServiceSupabase()
    const [{ data: sourceMemberships, error: sourceMembershipsError }, { data: targetMemberships, error: targetMembershipsError }] = await Promise.all([
      serviceSupabase
        .from('user_organizations')
        .select('organization_id,is_owner')
        .eq('user_id', sourceUserId),
      serviceSupabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', auth.user.id),
    ])

    if (sourceMembershipsError || targetMembershipsError) {
      return NextResponse.json(
        mobileFailure(
          'membership_fetch_failed',
          'Failed to load organization memberships',
          sourceMembershipsError || targetMembershipsError,
        ),
        { status: 500 },
      )
    }

    const targetOrgIds = new Set(
      (targetMemberships || []).map((row: any) => row.organization_id),
    )
    const membershipsToInsert = (sourceMemberships || [])
      .filter((row: any) => !targetOrgIds.has(row.organization_id))
      .map((row: any) => ({
        user_id: auth.user.id,
        organization_id: row.organization_id,
        is_owner: Boolean(row.is_owner),
      }))

    if (membershipsToInsert.length > 0) {
      const { error: insertError } = await serviceSupabase
        .from('user_organizations')
        .insert(membershipsToInsert)
      if (insertError) {
        return NextResponse.json(
          mobileFailure(
            'membership_merge_failed',
            'Failed to merge organization memberships',
            insertError,
          ),
          { status: 500 },
        )
      }
    }

    let tasksTransferred = 0
    if (transferTaskOwnership) {
      const { count } = await serviceSupabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', sourceUserId)
      tasksTransferred = count || 0

      if (tasksTransferred > 0) {
        const { error: updateError } = await serviceSupabase
          .from('tasks')
          .update({ assigned_to: auth.user.id })
          .eq('assigned_to', sourceUserId)
        if (updateError) {
          return NextResponse.json(
            mobileFailure(
              'task_reassign_failed',
              'Failed to transfer task ownership',
              updateError,
            ),
            { status: 500 },
          )
        }
      }
    }

    const mergedMetadata = {
      ...(sourceData.user.app_metadata || {}),
      linked_to_user_id: auth.user.id,
      linked_at: new Date().toISOString(),
      linked_by: 'mobile_password_reauth',
    }

    const { error: metadataError } = await admin.auth.admin.updateUserById(
      sourceUserId,
      { app_metadata: mergedMetadata },
    )
    if (metadataError) {
      return NextResponse.json(
        mobileFailure(
          'source_mark_failed',
          'Membership merge completed but source account marker failed',
          metadataError,
        ),
        { status: 500 },
      )
    }

    return NextResponse.json(
      mobileSuccess({
        source_user_id: sourceUserId,
        target_user_id: auth.user.id,
        memberships_added: membershipsToInsert.length,
        tasks_transferred: tasksTransferred,
        transfer_task_ownership: transferTaskOwnership,
      }),
      { status: 200 },
    )
  } catch (error) {
    console.error('❌ account link complete internal error:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      mobileFailure('internal_error', 'Failed to complete account link', {
        message,
      }),
      { status: 500 },
    )
  }
}
