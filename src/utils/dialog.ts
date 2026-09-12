import { reactive } from 'vue'

export interface DialogButton {
  label: string
  value: number
  primary?: boolean
}

export const dialogState = reactive({
  visible: false,
  title: '',
  message: '',
  detail: '',
  buttons: [] as DialogButton[]
})

let resolveDialog: ((value: number) => void) | null = null

export function requestDialog(options: {
  title: string
  message: string
  detail?: string
  buttons: DialogButton[]
}): Promise<number> {
  return new Promise((resolve) => {
    dialogState.title = options.title
    dialogState.message = options.message
    dialogState.detail = options.detail || ''
    dialogState.buttons = options.buttons
    dialogState.visible = true
    resolveDialog = resolve
  })
}

export function cancelDialogRequest(): void {
  resolveDialogRequest(-1)
}

export function resolveDialogRequest(value: number): void {
  dialogState.visible = false
  resolveDialog?.(value)
  resolveDialog = null
}
