import re,sys
f=sys.argv[1]; a=int(sys.argv[2]); b=int(sys.argv[3])
L=open(f,encoding='utf-8').read().split('\n')
for i in range(a-1,min(b,len(L))):
    s=L[i].strip()
    if len(s)>2 and s.upper()==s and re.search('[A-ZÇĞİÖŞÜ]{2}',s):
        print(i+1,s[:90])
