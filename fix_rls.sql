-- Immediate fix for RLS recursion issue
-- Run this directly in Supabase SQL editor

-- Drop the problematic recursive policies on user_organizations
DROP POLICY IF EXISTS "Admins can view all users in their organizations" ON user_organizations;
DROP POLICY IF EXISTS "Admins can add users to their organizations" ON user_organizations;
DROP POLICY IF EXISTS "Admins can remove users from their organizations" ON user_organizations;

-- Create non-recursive policies that don't query user_organizations within the policy
CREATE POLICY "Admins can view all users in their organizations" ON user_organizations
  FOR SELECT USING (
    user_id = auth.uid() 
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    OR is_super_admin()
  );

CREATE POLICY "Admins can add users to their organizations" ON user_organizations
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    OR is_super_admin()
  );

CREATE POLICY "Admins can remove users from their organizations" ON user_organizations
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'super_admin')
    OR is_super_admin()
  );