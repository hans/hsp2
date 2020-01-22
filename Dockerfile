FROM cpllab/psiturk

RUN pip install pandas scipy matplotlib seaborn
RUN pip install pathlib2
RUN pip install spacy
RUN python -m spacy download en

COPY materials /materials
