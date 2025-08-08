import { NextResponse } from 'next/server'
import { deleteOrganization, updateOrganization } from '@/lib/db'

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const body = await request.json()
    const updatedOrg = await updateOrganization(params.id, body)
    
    if (updatedOrg) {
      return NextResponse.json(updatedOrg)
    } else {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }
  } catch (error) {
    console.error('Error updating organization:', error)
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const success = await deleteOrganization(params.id)
    
    if (success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }
  } catch (error) {
    console.error('Error deleting organization:', error)
    return NextResponse.json({ error: 'Failed to delete organization' }, { status: 500 })
  }
}