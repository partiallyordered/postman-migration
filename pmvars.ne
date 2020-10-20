
@{%
const flatJoin = (data) => data.flat(Infinity).join('');
const value = (value) => ({ value });
const valueFlatJoin = (data) => value(flatJoin(data));
%}

# Wrapper exists only so we don't have to flatten all representations of pmvarstr
wrapper -> pmvarstr {% data => data.flat(Infinity) %}
pmvarstr ->
    notvariable
  | pmvartail
  | notvariable pmvartail
pmvartail ->
    variable
  | variable noclose
  | pmvartail variable
  | pmvartail variable noclose

variable    -> open varname close                         {% ([open, varname, close])                     => ({ var: [ value(varname) ] }) %}
             | open varname variable close                {% ([open, varname, variable, close])           => ({ var: [ value(varname), variable ] }) %}
             | open variable varname close                {% ([open, variable, varname, close])           => ({ var: [ variable, value(varname) ] }) %}
             | open varname variable varname close        {% ([open, varname, variable, varname2, close]) => ({ var: [ value(varname), variable, value(varname2) ] }) %}

open        -> "{{"
close       -> "}}"
varname     -> [^{}]:+                                    {% (data) => data[0].join('') %}

notvariable -> noopen
             | noopen open noclose                        {% ([noopen, open, noclose]) => value(`${noopen.value}${open}${noclose.value}`) %}

# can't contain two opening braces in sequence
noopen ->
    "{" noopentail                                        {% valueFlatJoin %}
  | noopentail                                            {% valueFlatJoin %}
noopentail ->
    [^{]
  | [^{] "{"
  | [^{] "{" noopentail
  | [^{] noopentail

# can't contain two closing braces in sequence
noclose ->
    "}" noclosetail                                       {% valueFlatJoin %}
  | noclosetail                                           {% valueFlatJoin %}
noclosetail ->
    [^}]
  | [^}] "}"
  | [^}] "}" noclosetail
  | [^}] noclosetail
