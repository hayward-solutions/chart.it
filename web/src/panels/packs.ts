export function packShortName(id: string): string {
  switch (id) {
    case 'aws':
      return 'AWS'
    case 'azure':
      return 'Azure'
    case 'gcp':
      return 'GCP'
    case 'k8s':
      return 'K8s'
    case 'generic':
      return 'Generic'
    default:
      return id
  }
}

export function packLongName(id: string): string {
  switch (id) {
    case 'aws':
      return 'AWS'
    case 'azure':
      return 'Azure'
    case 'gcp':
      return 'Google Cloud'
    case 'k8s':
      return 'Kubernetes'
    case 'generic':
      return 'Generic'
    default:
      return id
  }
}
