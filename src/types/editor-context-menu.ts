export interface EditorContextMenuItem {
  label: string
  action?: () => void
  children?: EditorContextMenuItem[]
  divider?: boolean
}
