{{- define "mc-panel.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "mc-panel.fullname" -}}
{{- .Release.Name -}}
{{- end -}}

{{- define "mc-panel.labels" -}}
app.kubernetes.io/name: {{ include "mc-panel.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
