$body = @{
  full_name = 'PranavAD36/Advanced-Web-Development-Frameworks'
  owner = @{ login = 'PranavAD36' }
  name = 'Advanced-Web-Development-Frameworks'
  html_url = 'https://github.com/PranavAD36/Advanced-Web-Development-Frameworks'
  default_branch = 'main'
  description = 'Test repo'
}

$headers = @{
  Authorization = 'Bearer mock_token_test'
  Origin = 'http://localhost:3000'
}

try {
  $resp = Invoke-RestMethod -Method Post -Uri 'http://localhost:8000/v1/github/repositories/connect' -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Compress)
  Write-Host 'STATUS: success'
  $resp | ConvertTo-Json -Depth 10
}
catch {
  Write-Host 'STATUS: error'
  Write-Host $_.Exception.Message
  if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
  if ($_.Exception.Response) { Write-Host $_.Exception.Response.StatusCode }
}
