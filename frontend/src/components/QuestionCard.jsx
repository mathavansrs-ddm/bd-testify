const OPTIONS = ['a', 'b', 'c', 'd']
const LABELS = { a: 'A', b: 'B', c: 'C', d: 'D' }

export default function QuestionCard({ question, selectedOption, onSelect, index }) {
  const optionText = {
    a: question.option_a,
    b: question.option_b,
    c: question.option_c,
    d: question.option_d,
  }

  return (
    <div className="space-y-6">
      <div className="bg-navy-900 text-white rounded-xl p-6">
        <p className="text-xs font-medium text-navy-300 mb-2">Question {index + 1} • {question.marks} mark{question.marks !== 1 ? 's' : ''}</p>
        <p className="text-lg leading-relaxed">{question.question_text}</p>
      </div>

      <div className="space-y-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
              selectedOption === opt
                ? 'border-navy-900 bg-navy-50 text-navy-900'
                : 'border-gray-200 hover:border-navy-300 hover:bg-gray-50 text-gray-700'
            }`}
          >
            <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              selectedOption === opt ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600'
            }`}>
              {LABELS[opt]}
            </span>
            <span className="text-sm leading-relaxed">{optionText[opt]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
