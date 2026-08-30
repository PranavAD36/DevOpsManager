import json
import urllib.request

body = {
    'full_name': 'PranavAD36/Advanced-Web-Development-Frameworks',
    'owner': {'login': 'PranavAD36'},
    'name': 'Advanced-Web-Development-Frameworks',
    'html_url': 'https://github.com/PranavAD36/Advanced-Web-Development-Frameworks',
    'default_branch': 'main',
    'description': 'Test repo'
}

req = urllib.request.Request(
    'http://localhost:8000/v1/github/repositories/connect',
    data=json.dumps(body).encode('utf-8'),
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock_token_test',
        'Origin': 'http://localhost:3000',
    },
    method='POST',
)

try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print('STATUS', r.status)
        body = r.read().decode('utf-8')
        print(body)
except Exception as e:
    print('EXCEPTION', type(e).__name__)
    if hasattr(e, 'read'):
        try:
            print(e.read().decode('utf-8'))
        except Exception:
            pass
    if hasattr(e, 'msg'):
        print('MSG', e.msg)
